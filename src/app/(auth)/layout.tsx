import { Think } from "ui/think";
import { getTranslations } from "next-intl/server";
import { FlipWords } from "ui/flip-words";
import { BackgroundPaths } from "ui/background-paths";

export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getTranslations("Auth.Intro");
  return (
    <main className="relative w-full flex flex-col h-screen">
      <div className="flex-1">
        <div className="flex min-h-screen w-full">
          <div className="hidden lg:flex lg:w-1/2 bg-muted border-r flex-col p-18 relative">
            <div className="absolute inset-0 w-full h-full">
              <BackgroundPaths />
            </div>
            <h1 className="text-xl font-semibold flex flex-col items-start gap-1 animate-in fade-in duration-1000">
              <div className="flex items-center gap-3">
                <Think />
                <span>Construction Cost</span>
              </div>
              <span className="text-lg text-muted-foreground ml-8">
                Co-Pilot
              </span>
            </h1>
            <div className="flex-1" />
            <FlipWords
              words={[t("description")]}
              className=" mb-4 text-muted-foreground"
            />
          </div>

          <div className="w-full lg:w-1/2 p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
