'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  customer: { name: string } | null;
  building_address: string;
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
    } catch (error) {
      console.error('Error fetching projects:', error);
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
    } catch (error) {
      console.error('Error navigating to assessment:', error);
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
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
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
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
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
                className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition"
              >
                <h3 className="font-semibold text-lg mb-2">{project.name}</h3>
                {project.customer && (
                  <p className="text-sm text-gray-600 mb-1">Customer: {project.customer.name}</p>
                )}
                {project.building_address && (
                  <p className="text-sm text-gray-600 mb-2">{project.building_address}</p>
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
