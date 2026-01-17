import { useState, useEffect, useRef } from 'react';
import type { Profile } from '@connectty/shared';
import { api } from '../services/api';

interface ProfileSelectorProps {
  onProfileSwitch?: () => void;
}

export default function ProfileSelector({ onProfileSwitch }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProfiles = async () => {
    try {
      const [profileList, active] = await Promise.all([
        api.getProfiles(),
        api.getActiveProfile(),
      ]);
      setProfiles(profileList);
      setActiveProfile(active);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === activeProfile?.id) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      await api.switchProfile(profileId);
      const newActive = profiles.find((p) => p.id === profileId) || null;
      setActiveProfile(newActive);
      setIsOpen(false);
      onProfileSwitch?.();
    } catch (err) {
      console.error('Failed to switch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;

    setLoading(true);
    try {
      const newProfile = await api.createProfile({ name: newProfileName.trim() });
      setProfiles([...profiles, newProfile]);
      setNewProfileName('');
      setIsCreating(false);
      // Switch to the new profile
      await handleSwitchProfile(newProfile.id);
    } catch (err) {
      console.error('Failed to create profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const profile = profiles.find((p) => p.id === profileId);
    if (profile?.isDefault) {
      alert('Cannot delete the default profile');
      return;
    }

    if (!confirm(`Delete profile "${profile?.name}"? This will delete all connections, credentials, and groups in this profile.`)) {
      return;
    }

    setLoading(true);
    try {
      await api.deleteProfile(profileId);
      setProfiles(profiles.filter((p) => p.id !== profileId));
      if (activeProfile?.id === profileId) {
        // Switch to default profile
        const defaultProfile = profiles.find((p) => p.isDefault);
        if (defaultProfile) {
          await handleSwitchProfile(defaultProfile.id);
        }
      }
    } catch (err) {
      console.error('Failed to delete profile:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
        title="Switch workspace profile"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span className="max-w-[120px] truncate">{activeProfile?.name || 'Default'}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-gray-700">
            <div className="text-xs text-gray-400 uppercase font-semibold px-2 py-1">Workspace Profiles</div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                onClick={() => handleSwitchProfile(profile.id)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700 ${
                  profile.id === activeProfile?.id ? 'bg-gray-700 text-cyan-400' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {profile.id === activeProfile?.id && (
                    <svg className="w-4 h-4 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={`truncate ${profile.id !== activeProfile?.id ? 'ml-6' : ''}`}>
                    {profile.name}
                  </span>
                  {profile.isDefault && (
                    <span className="text-xs text-gray-500 flex-shrink-0">(default)</span>
                  )}
                </div>
                {!profile.isDefault && (
                  <button
                    onClick={(e) => handleDeleteProfile(profile.id, e)}
                    className="text-gray-500 hover:text-red-400 p-1"
                    title="Delete profile"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-gray-700 p-2">
            {isCreating ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProfile();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Profile name"
                  className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-sm focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
                <button
                  onClick={handleCreateProfile}
                  disabled={!newProfileName.trim() || loading}
                  className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
