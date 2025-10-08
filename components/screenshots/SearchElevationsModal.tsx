'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import type { Screenshot, ElementGroup } from '@/types/database';

interface SearchElevationsModalProps {
  open: boolean;
  onClose: () => void;
  assessmentId: string;
  currentCheckId: string;
  onAssign: (screenshotIds: string[]) => Promise<void>;
}

const ELEMENT_TYPE_COLORS: Record<string, string> = {
  doors: 'bg-blue-600',
  bathrooms: 'bg-purple-600',
  kitchens: 'bg-orange-600',
  'exit-signage': 'bg-red-600',
  'assisted-listening': 'bg-indigo-600',
  elevators: 'bg-cyan-600',
  'elevator-signage': 'bg-teal-600',
  'parking-signage': 'bg-yellow-600',
  ramps: 'bg-green-600',
  'changes-in-level': 'bg-pink-600',
  'turning-spaces': 'bg-violet-600',
};

export function SearchElevationsModal({
  open,
  onClose,
  assessmentId,
  currentCheckId: _currentCheckId,
  onAssign,
}: SearchElevationsModalProps) {
  const [elevations, setElevations] = useState<Screenshot[]>([]);
  const [filteredElevations, setFilteredElevations] = useState<Screenshot[]>([]);
  const [elementGroups, setElementGroups] = useState<ElementGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [elementFilter, setElementFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Fetch element groups
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/element-groups');
        const data = await res.json();
        setElementGroups(data.element_groups || []);
      } catch (error) {
        console.error('Failed to fetch element groups:', error);
      }
    })();
  }, []);

  // Fetch all elevations for this assessment
  useEffect(() => {
    if (!open) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/screenshots?assessment_id=${assessmentId}&screenshot_type=elevation`
        );
        const { screenshots } = await res.json();
        console.log('[SearchElevationsModal] Fetched elevations:', screenshots);
        setElevations(screenshots || []);
      } catch (error) {
        console.error('Failed to fetch elevations:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, assessmentId]);

  // Fetch presigned URLs for thumbnails
  useEffect(() => {
    (async () => {
      const urls: Record<string, string> = {};
      for (const elevation of elevations) {
        try {
          const res = await fetch('/api/screenshots/presign-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnailUrl: elevation.thumbnail_url }),
          });
          const { thumbnail } = await res.json();
          urls[elevation.id] = thumbnail;
        } catch (error) {
          console.error('Failed to get presigned URL:', error);
        }
      }
      setPresignedUrls(urls);
    })();
  }, [elevations]);

  // Apply filters
  useEffect(() => {
    let filtered = elevations;

    // Filter by element group
    if (elementFilter !== 'all') {
      filtered = filtered.filter(e => {
        const elementGroup = elementGroups.find(g => g.id === e.element_group_id);
        return elementGroup?.slug === elementFilter;
      });
    }

    // Filter by search query (caption + extracted_text)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e => {
        const caption = e.caption?.toLowerCase() || '';
        const extractedText = e.extracted_text?.toLowerCase() || '';
        return caption.includes(query) || extractedText.includes(query);
      });
    }

    setFilteredElevations(filtered);
  }, [elevations, elementFilter, searchQuery, elementGroups]);

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;

    setAssigning(true);
    try {
      await onAssign(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Failed to assign elevations:', error);
      alert('Failed to assign elevations. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Search Elevations">
      <div className="flex flex-col gap-4 h-[600px]">
        {/* Search & Filter Bar */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by caption or text..."
            className="flex-1 border rounded px-3 py-2"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="border rounded px-3 py-2"
            value={elementFilter}
            onChange={e => setElementFilter(e.target.value)}
          >
            <option value="all">All Elements</option>
            {elementGroups.map(group => (
              <option key={group.id} value={group.slug}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto border rounded p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading elevations...
            </div>
          ) : filteredElevations.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No elevations found. Try adjusting your search or filters.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {filteredElevations.map(elevation => {
                const elementGroup = elementGroups.find(g => g.id === elevation.element_group_id);
                return (
                  <div
                    key={elevation.id}
                    className={`border rounded p-2 cursor-pointer transition-all ${
                      selectedIds.has(elevation.id)
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => toggleSelection(elevation.id)}
                  >
                    <div className="relative aspect-video bg-gray-100 rounded overflow-hidden mb-2">
                      {presignedUrls[elevation.id] ? (
                        <img
                          src={presignedUrls[elevation.id]}
                          alt={elevation.caption || 'Elevation'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                          Loading...
                        </div>
                      )}

                      {/* Element Type Badge */}
                      {elementGroup && (
                        <div
                          className={`absolute top-1 left-1 ${
                            ELEMENT_TYPE_COLORS[elementGroup.slug] || 'bg-gray-600'
                          } text-white text-xs px-2 py-0.5 rounded`}
                        >
                          {elementGroup.name}
                        </div>
                      )}

                      {/* Selection Checkbox */}
                      <div className="absolute top-1 right-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(elevation.id)}
                          onChange={() => toggleSelection(elevation.id)}
                          className="w-5 h-5"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {/* Caption */}
                    <div
                      className="text-sm font-medium truncate"
                      title={elevation.caption || 'No caption'}
                    >
                      {elevation.caption || 'No caption'}
                    </div>

                    {/* Page Number */}
                    <div className="text-xs text-gray-500">Page {elevation.page_number}</div>

                    {/* Extracted Text Preview */}
                    {elevation.extracted_text && (
                      <div
                        className="text-xs text-gray-600 mt-1 line-clamp-2"
                        title={elevation.extracted_text}
                      >
                        {elevation.extracted_text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-3 border-t">
          <div className="text-sm text-gray-600">
            {selectedIds.size} elevation{selectedIds.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              onClick={onClose}
              disabled={assigning}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              onClick={handleAssign}
              disabled={selectedIds.size === 0 || assigning}
            >
              {assigning
                ? 'Assigning...'
                : `Assign ${selectedIds.size} Elevation${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
