'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  customer: { name: string } | null;
  status: string;
  created_at: string;
  assessments?: { id: string }[];
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch {
      // console.error('Error fetching projects');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectClick = async (projectId: string) => {
    // Check if project has an assessment, if not create one
    try {
      const response = await fetch(`/api/projects/${projectId}/assessment`);
      if (response.ok) {
        const { assessmentId } = await response.json();
        router.push(`/assessments/${assessmentId}`);
      }
    } catch {
      // console.error('Error navigating to assessment');
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation(); // Prevent triggering project click

    const confirmed = window.confirm(
      'Are you sure you want to delete this project? This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh the projects list
        fetchProjects();
      } else {
        alert('Failed to delete project');
      }
    } catch {
      alert('Error deleting project');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 stack-md">
        <header className="stack-sm">
          <h1 className="text-2xl font-bold text-gray-900">Compliance Assessment Platform</h1>
          <p className="text-gray-600">Select an existing project or create a new one</p>
        </header>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Your Projects</h2>
          <Link href="/projects/new" className="btn-primary">
            + Create New Project
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="card text-center stack-sm">
            <p className="text-gray-500">No projects yet</p>
            <Link href="/projects/new" className="btn-primary">
              Create Your First Project
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col">Project Name</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {projects.map(project => (
                  <tr
                    key={project.id}
                    className="group hover:bg-blue-50 hover:shadow-sm cursor-pointer transition-all duration-150 active:bg-blue-100 border-l-4 border-l-transparent hover:border-l-blue-500"
                    onClick={() => handleProjectClick(project.id)}
                  >
                    <td>
                      <div className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                        {project.name}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-gray-500">{project.customer?.name || '-'}</div>
                    </td>
                    <td>
                      <span
                        className={
                          project.status === 'completed'
                            ? 'badge-success'
                            : project.status === 'active'
                              ? 'badge-active'
                              : 'badge-pending'
                        }
                      >
                        {project.status || 'In Progress'}
                      </span>
                    </td>
                    <td className="text-sm text-gray-500">
                      {new Date(project.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-right text-sm font-medium">
                      <button
                        onClick={e => handleDeleteProject(e, project.id)}
                        className="btn-danger opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Delete project"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
