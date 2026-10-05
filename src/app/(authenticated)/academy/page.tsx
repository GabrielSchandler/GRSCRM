import Link from "next/link";
import { BookOpenCheck, GraduationCap, Clock, CheckCircle2 } from "lucide-react";
import { academyCourses } from "@/lib/academy/course";
import { loadAcademyUserProgress, summarizeAcademyProgress } from "@/lib/academy/service";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { isModuleEnabled, loadCompanyPlatformSettings } from "@/lib/company/platform-settings";
import { PageHeader } from "@/components/layout/page-header";
import { ManagementMetric } from "@/components/management/management-ui";
import { ReferenceCollection } from "@/components/newsec/reference-collection";
import { ReferenceFacts, ReferenceBadge, ReferenceTabs } from "@/components/newsec/reference-ui";

export default async function AcademyPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const { supabase, companyId, role, userProfileId } =
    await getCurrentUserContext();
  const { settings } = await loadCompanyPlatformSettings(supabase, companyId);

  if (!isModuleEnabled(settings, "academy")) {
    return (
      <main className="min-h-screen bg-slate-100">
        <section className="border-b border-slate-200 bg-white px-6 py-8">
          <p className="text-sm font-medium text-teal-700">CRM SaaS</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Academy</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            O módulo Academy ainda não está habilitado para esta empresa.
          </p>
        </section>
      </main>
    );
  }

  const courseProgress = await Promise.all(
    academyCourses.map(async (course) => ({
      course,
      progress: await loadAcademyUserProgress({
        supabase,
        companyId,
        userProfileId,
        course,
      }),
    })),
  );
  const tableReady = courseProgress.every((item) => item.progress.tableReady);
  const errorMessage =
    courseProgress.find((item) => item.progress.errorMessage)?.progress.errorMessage ??
    null;


  const summaries = courseProgress.map(item => summarizeAcademyProgress(item.progress.statuses));
  const chapters = academyCourses.reduce((sum, course) => sum + course.chapters.length, 0);
  const completed = summaries.reduce((sum, summary) => sum + summary.completedChapters, 0);
  return <>
    <PageHeader title="Academy" description="Treinamentos, cursos e aprendizado interno." />
    <div className="reference-page space-y-4 p-4 sm:p-6">
      <ReferenceTabs items={[{label:"Catálogo",href:"/academy",active:true},...(role === "admin" || role === "manager" ? [{label:"Administração",href:"/academy/gestao"}] : [])]} />
      {(!tableReady || params.error === "sql") && <p role="alert" className="text-sm text-[var(--ns-warning)]">Progresso indisponível: a estrutura do Academy precisa ser configurada.</p>}
      {errorMessage && <p role="alert" className="text-sm text-[var(--ns-danger)]">{errorMessage}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ManagementMetric label="Cursos disponíveis" value={academyCourses.length} icon={GraduationCap} />
        <ManagementMetric label="Capítulos disponíveis" value={chapters} icon={BookOpenCheck} />
        <ManagementMetric label="Seus capítulos concluídos" value={tableReady ? completed : "Indisponível"} icon={CheckCircle2} tone="success" />
        <ManagementMetric label="Duração do catálogo" value={`${academyCourses.reduce((sum, course) => sum + course.estimatedMinutes, 0)} min`} icon={Clock} tone="warning" />
      </div>
      <ReferenceCollection title="Cursos" detailTitle="Detalhes do curso" columns={["Curso", "Categoria", "Público", "Capítulos", "Seu progresso", "Ações"]} rows={courseProgress.map(({course,progress},index) => {
        const summary = summaries[index];
        const approved = progress.statuses.filter(status => status.approved).length;
        const nextChapter = progress.statuses.find(status => !status.approved)?.chapter ?? course.chapters[0];
        const link = <Link key="actions" href={`/academy/cursos/${course.slug}`} className="text-[var(--ns-primary)] font-semibold">Ver curso</Link>;
        return {id:course.slug,title:course.title,search:[course.title,course.description,course.subtitle].join(" "),type:course.subtitle,status:!tableReady ? "Indisponível" : approved === course.chapters.length ? "Concluído" : approved > 0 ? "Em andamento" : "Não iniciado",
          cells:[<div key="name"><p className="font-semibold">{course.title}</p><p className="mt-1 text-[10px] text-[var(--ns-text-secondary)]">{course.subtitle}</p></div>,course.subtitle,course.audience,course.chapters.length,tableReady ? `${approved}/${course.chapters.length}` : "Indisponível",link],
          detail: <div key={course.slug} className="space-y-4"><ReferenceBadge>{course.subtitle}</ReferenceBadge><p className="text-xs leading-5 text-[var(--ns-text-secondary)]">{course.description}</p><ReferenceFacts items={[["Público",course.audience],["Duração",`${course.estimatedMinutes} min`],["Capítulos",course.chapters.length],["Concluídos",tableReady ? summary.completedChapters : "Indisponível"],["Nota média",tableReady && summary.averageScore !== null ? `${summary.averageScore}%` : "Não disponível"]]} /><h3 className="text-xs font-semibold">Capítulos</h3><ul className="divide-y divide-[var(--ns-border)]">{course.chapters.map(chapter => <li key={chapter.id} className="flex items-center justify-between gap-3 py-2 text-xs"><Link href={`/academy/cursos/${course.slug}/capitulos/${chapter.id}`} className="text-[var(--ns-primary)]">{chapter.title}</Link><span className="shrink-0 text-[var(--ns-text-secondary)]">{chapter.estimatedMinutes} min</span></li>)}</ul>{nextChapter && <Link href={`/academy/cursos/${course.slug}/capitulos/${nextChapter.id}`} className="inline-flex rounded-md bg-[var(--ns-primary)] px-4 py-2 text-xs font-semibold text-[var(--ns-primary-foreground)]">Continuar curso</Link>}</div>};
      })} />
    </div>
  </>;
}

