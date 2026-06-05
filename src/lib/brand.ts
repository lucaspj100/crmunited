import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Brand = {
  brand_name: string;
  brand_subtitle: string;
  logo_path: string | null;
  logo_url: string | null;
};

export function useBrand() {
  return useQuery({
    queryKey: ["brand"],
    queryFn: async (): Promise<Brand> => {
      const { data } = await supabase
        .from("app_settings")
        .select("brand_name,brand_subtitle,logo_path")
        .eq("id", true)
        .maybeSingle();
      const row = data ?? { brand_name: "Comercial", brand_subtitle: "Franquia", logo_path: null };
      let logo_url: string | null = null;
      if (row.logo_path) {
        const { data: signed } = await supabase.storage
          .from("branding")
          .createSignedUrl(row.logo_path, 60 * 60 * 24 * 7);
        logo_url = signed?.signedUrl ?? null;
      }
      return { ...row, logo_url } as Brand;
    },
    staleTime: 60_000,
  });
}
