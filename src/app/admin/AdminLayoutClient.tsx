"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Settings,
  Send,
  TestTube,
  LogOut,
  Layers,
  ExternalLink,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "工作台", icon: LayoutDashboard },
  { href: "/admin/cases", label: "案例库", icon: FileText },
  { href: "/admin/rules", label: "规则管理", icon: BookOpen },
  { href: "/admin/rule-sets", label: "规则集", icon: Layers },
  { href: "/admin/params", label: "参数管理", icon: Settings },
  { href: "/admin/publish", label: "发布中心", icon: Send },
  { href: "/admin/tests", label: "测试中心", icon: TestTube },
];

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const session = useSession();
  const userName = session?.data?.user?.name ?? "管理员";
  const currentSection =
    navItems
      .filter(({ href }) =>
        href === "/admin" ? pathname === href : pathname.startsWith(href),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "管理后台";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[282px] shrink-0 border-r border-border bg-card/95 text-foreground shadow-[8px_0_32px_rgba(23,61,59,0.05)] backdrop-blur-xl xl:flex xl:flex-col">
        <div className="border-b border-border px-6 py-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-primary">
            社保规则控制台
          </div>
          <p className="mt-4 font-display text-xl font-semibold text-foreground">辽宁社保管理后台</p>
          <p className="mt-1 text-sm text-muted-foreground">政策规则与发布管理</p>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group flex cursor-pointer items-center gap-3.5 rounded-xl border px-3.5 py-3 text-base transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  isActive
                    ? "border-primary/20 bg-primary/10 font-medium text-primary shadow-sm"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-background-elevated hover:text-foreground"
                }`}
              >
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                    isActive
                      ? "border-primary/20 bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background-elevated text-muted-foreground group-hover:border-primary/20 group-hover:text-primary"
                  }`}
                >
                  <Icon size={16} />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border bg-background-elevated/55 p-5">
          <div className="mb-4 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              当前用户
            </p>
            <p className="mt-1.5 truncate text-base font-medium text-foreground">
              {userName}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-base text-muted-foreground shadow-sm transition-colors hover:border-primary/25 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 hidden h-[68px] items-center justify-between border-b border-border bg-card/90 px-8 backdrop-blur-xl xl:flex">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">管理控制台</span>
            <span className="text-border">/</span>
            <span className="font-medium text-foreground">{currentSection}</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            打开用户端
            <ExternalLink size={14} />
          </Link>
        </header>

        <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur-xl xl:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg font-semibold text-foreground">社保管理后台</p>
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary">
              打开用户端 <ExternalLink size={14} />
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${isActive ? "border-primary/25 bg-primary/10 font-medium text-primary" : "border-border bg-card text-muted-foreground"}`}>
                  <Icon size={14} /> {label}
                </Link>
              );
            })}
          </nav>
        </header>
        <div className="mx-auto w-full max-w-[1600px] px-5 py-5 sm:px-7 sm:py-7 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
