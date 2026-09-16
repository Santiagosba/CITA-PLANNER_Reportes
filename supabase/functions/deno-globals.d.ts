/** Tipos de Edge Runtime para el editor. Deno los trae solo; Cursor no. */
declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}
declare module "@supabase/functions-js/edge-runtime.d.ts" {}
declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}
