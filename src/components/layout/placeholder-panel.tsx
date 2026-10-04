type PlaceholderPanelProps = {
  title: string;
  description: string;
};

export function PlaceholderPanel({ title, description }: PlaceholderPanelProps) {
  return (
    <section className="rounded-[12px] border border-[#DDE2EC] bg-white p-6 shadow-none">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5267F5]">Primeira etapa</p>
      <h3 className="mt-2 text-xl font-semibold text-[#11182E]">{title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#69738A]">
        {description}
      </p>
    </section>
  );
}
