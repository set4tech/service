import '@/app/globals.css';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-4 py-2 flex items-center gap-4">
        <Link href="/assessments/start" className="font-medium">Start Assessment</Link>
        <Link href="/projects" className="font-medium">Projects</Link>
        <Link href="/customers" className="font-medium">Customers</Link>
        <Link href="/reports" className="font-medium">Reports</Link>
        <Link href="/templates" className="font-medium">Templates</Link>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}