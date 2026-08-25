import Link from "next/link";
import {
  ArrowRight,
  Bot,
  FileCheck,
  Coins,
  ShieldCheck,
  Layers3,
} from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { PaperBackdrop } from "@/components/layout/PaperBackdrop";

const featureCards = [
  {
    title: "政策查询 + 智能解读",
    desc: "围绕辽宁养老、医保和参保政策提供对话式解读，让关键信息更容易理解。",
    icon: Bot,
  },
  {
    title: "查询结果有依据",
    desc: "展示关键条件、计算过程和政策口径，方便核对信息并准备后续办理。",
    icon: FileCheck,
  },
  {
    title: "待遇与补贴参考",
    desc: "根据个人情况梳理可能涉及的就业补贴、失业待遇和办理时间节点。",
    icon: Coins,
  },
  {
    title: "缴费风险提醒",
    desc: "提示断缴影响、缴费年限缺口和资格时间窗口，帮助提前做好准备。",
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <PaperBackdrop />
      <MarketingNav active="home" />

      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 pb-20 pt-12 sm:pt-16 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-20 lg:px-10 lg:pt-24">
        <div className="space-y-10">
          <p className="anim-fade-up text-sm font-medium uppercase tracking-[0.2em] text-primary/90">
            辽宁社会保障服务指南 · 2026
          </p>

          <h1 className="anim-fade-up anim-d1 font-display text-4xl font-bold leading-[1.12] text-foreground sm:text-6xl lg:text-7xl">
            辽宁社保查询
            <br />
            政策待遇一站了解
          </h1>

          <p className="anim-fade-up anim-d2 max-w-2xl text-lg leading-9 text-muted-foreground sm:text-xl">
            输入您的基本情况，即可了解养老、医保、缴费年限、退休条件与补贴政策。
            查询结果同时展示关键依据，帮助您看懂政策、理清办理方向。
          </p>

          <div className="anim-fade-up anim-d3 flex flex-wrap items-center gap-4">
            <Link
              href="/chat"
              className="group inline-flex cursor-pointer items-center gap-3 rounded-xl bg-primary px-7 py-4 text-base font-semibold text-white shadow-md transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-8 sm:text-[1.06rem]"
            >
              开始社保查询
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <Link
              href="/cases"
              className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-background-elevated px-7 py-4 text-base font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[1.05rem]"
            >
              查看参考案例
            </Link>
          </div>

          <p className="text-sm text-muted-foreground sm:text-base">
            无需注册 · 支持多轮补充信息 · 查询结果仅供参考
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <article className="rounded-2xl border border-border bg-card p-6 shadow-md">
            <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">交付结构</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">结果 + 依据 + 指引</p>
            <p className="mt-3 text-base leading-8 text-muted-foreground">
              汇总关键条件、缴费缺口、待遇信息和办理方向，方便后续核实。
            </p>
          </article>

          <article className="rounded-2xl border border-border bg-card p-6 shadow-md">
            <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">查询范围</p>
            <div className="mt-3 space-y-3 text-base text-foreground">
              <p className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                养老与退休条件
              </p>
              <p className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                医保与缴费信息
              </p>
              <p className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                补贴与待遇参考
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 lg:px-10">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-primary">服务能力</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-foreground sm:text-5xl">
              常见社保问题清晰查询
            </h2>
          </div>
          <span className="hidden rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground sm:inline-flex">
            <Layers3 className="mr-1.5 h-3.5 w-3.5" />
            辽宁社保服务指南
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {featureCards.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="group rounded-2xl border border-border bg-card p-7 shadow-md transition-colors hover:border-primary/35"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background-elevated text-primary transition-colors group-hover:border-primary/35 group-hover:text-primary-hover">
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="mt-3 text-base leading-8 text-muted-foreground">{item.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
