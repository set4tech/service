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

    const confirmed = window.confirm('Are you sure you want to delete this project? This action cannot be undone.');
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Compliance Assessment Platform</h1>
          <p className="text-gray-600 mt-2">Select an existing project or create a new one</p>
        </div>

        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Your Projects</h2>
          <Link
            href="/projects/new"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            + Create New Project
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">No projects yet</p>
            <Link
              href="/projects/new"
              className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition"
            >
              Create Your First Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition relative group"
              >
                <button
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                  title="Delete project"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <h3 className="font-semibold text-lg mb-2 pr-8">{project.name}</h3>
                {project.customer && (
                  <p className="text-sm text-gray-600 mb-2">Customer: {project.customer.name}</p>
                )}
                <div className="flex justify-between items-center mt-4">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      project.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {project.status || 'in_progress'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
