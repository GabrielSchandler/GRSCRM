type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="border-b border-[#DDE2EC] bg-white px-6 py-5 lg:px-9">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5267F5]">CRM • Produtividade</p>
      <h2 className="mt-1 text-2xl font-semibold text-[#11182E]">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#69738A]">
        {description}
      </p>
    </header>
  );
}
