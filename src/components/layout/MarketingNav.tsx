import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavKey = "home" | "chat" | "cases";

const linkMap: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "chat", href: "/chat", label: "社保查询" },
  { key: "cases", href: "/cases", label: "参考案例" },
];

export function MarketingNav({ active }: { active: NavKey }) {
  return (
    <header className="sticky top-0 z-30 px-4 pt-5 sm:px-6 lg:px-10">
      <nav className="mx-auto flex h-[74px] w-full max-w-7xl items-center justify-between rounded-2xl border border-border bg-card/95 px-5 shadow-md backdrop-blur sm:h-[82px] sm:px-6">
        <Link
          href="/"
          className="group inline-flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-base transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <span className="font-semibold text-foreground sm:text-[1.03rem]">
            辽宁社保查询助手
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {linkMap.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-xl px-3.5 py-2.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-5 sm:text-[0.95rem]",
                  isActive
                    ? "border border-primary/30 bg-primary-light font-medium text-primary"
                    : "text-muted-foreground hover:bg-background-elevated hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <Link
            href="/admin/login"
            className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-background-elevated px-3.5 py-2.5 text-sm text-foreground transition-all hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-5 sm:text-[0.95rem]"
          >
            管理后台
          </Link>
        </div>
      </nav>
    </header>
  );
}
