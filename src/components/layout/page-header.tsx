type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <>
    <header className="border-b border-[var(--ns-border)] bg-[var(--ns-surface)] px-6 py-3 lg:px-9">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--ns-text)]">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ns-text-secondary)]">
            {description}
          </p>
        </div>
        <ThemeToggle />
      </div>
    </header>
    <ManagementNavigation />
    </>
  );
}
import { ThemeToggle } from "@/components/newsec/theme-toggle";
import { ManagementNavigation } from "@/components/management/management-navigation";
