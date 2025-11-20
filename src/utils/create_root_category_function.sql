-- Función para crear categorías raíz (padre) sin violar la foreign key constraint
-- Esta función permite insertar una categoría con idpcategory = idcategory
-- 
-- NOTA: Esta función intenta múltiples estrategias:
-- 1. Insertar con NULL y luego actualizar (si la columna permite NULL)
-- 2. Diferir la constraint (si es DEFERRABLE)
-- 3. Si ninguna funciona, lanza un error descriptivo

CREATE OR REPLACE FUNCTION nubestock.create_root_category(p_namecategory VARCHAR)
RETURNS TABLE (
  idcategory UUID,
  namecategory VARCHAR,
  idpcategory UUID,
  isactive BOOLEAN,
  creationdate TIMESTAMP,
  modificationdate TIMESTAMP
) AS $$
DECLARE
  new_id UUID;
BEGIN
  -- Generar UUID
  new_id := gen_random_uuid();
  
  -- Estrategia 1: Intentar insertar con NULL y luego actualizar
  BEGIN
    INSERT INTO nubestock.tb_mae_category (idcategory, namecategory, idpcategory, isactive, creationdate)
    VALUES (new_id, p_namecategory, NULL, true, now());
    
    -- Actualizar con el mismo idcategory
    UPDATE nubestock.tb_mae_category 
    SET idpcategory = nubestock.tb_mae_category.idcategory 
    WHERE nubestock.tb_mae_category.idcategory = new_id;
    
  EXCEPTION 
    WHEN not_null_violation THEN
      -- La columna no permite NULL, intentar estrategia 2
      BEGIN
        -- Estrategia 2: Intentar diferir la constraint
        SET CONSTRAINTS nubestock.tb_mae_category_parent_fk DEFERRED;
        
        -- Insertar con el mismo UUID
        INSERT INTO nubestock.tb_mae_category (idcategory, namecategory, idpcategory, isactive, creationdate)
        VALUES (new_id, p_namecategory, new_id, true, now());
        
      EXCEPTION 
        WHEN OTHERS THEN
          -- Si tampoco funciona, lanzar error descriptivo
          RAISE EXCEPTION 'No se puede crear categoría raíz. La columna idpcategory no permite NULL y la constraint no es DEFERRABLE. Se requiere: ALTER TABLE nubestock.tb_mae_category ALTER COLUMN idpcategory DROP NOT NULL; O hacer la constraint DEFERRABLE.';
      END;
    WHEN OTHERS THEN
      RAISE;
  END;
  
  -- Retornar la categoría creada
  RETURN QUERY
  SELECT * FROM nubestock.tb_mae_category WHERE nubestock.tb_mae_category.idcategory = new_id;
END;
$$ LANGUAGE plpgsql;

