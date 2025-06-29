import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const healthcheck: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.res = {
        body: "OK"
    };
};

export default healthcheck;
