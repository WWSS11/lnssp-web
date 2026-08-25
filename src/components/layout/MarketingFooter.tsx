export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-border bg-card/95">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3.5 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-[0.95rem]">
        <p>查询与测算结果仅供参考，实际办理请以辽宁省各级人社、医保部门解释为准。</p>
        <p>&copy; {new Date().getFullYear()} 辽宁社保查询助手</p>
      </div>
    </footer>
  );
}
