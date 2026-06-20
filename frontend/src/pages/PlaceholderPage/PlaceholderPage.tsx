import { PageShell } from '@/components/project-os/ProjectOSComponents';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

type PlaceholderPageProps = {
  title: string;
};

function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <PageShell className="po-page-tall content-center rounded-lg border border-white/10 bg-slate-900/50 p-8 shadow-po-panel md:p-11">
      <p className="mb-2 text-xs font-black uppercase tracking-normal text-violet-300">Project OS</p>
      <h2 className="text-4xl font-bold leading-none text-white md:text-5xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-slate-400">This area is ready, but we have not added controls here yet.</p>
      {title === 'Applications' && (
        <Button asChild className="mt-6 w-fit bg-violet-600 text-white hover:bg-violet-500">
          <Link to="/discover">Browse apps</Link>
        </Button>
      )}
    </PageShell>
  );
}

export default PlaceholderPage;
