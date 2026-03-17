import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { Camera } from 'lucide-react';

interface AvatarUploadProps {
  /** Current avatar URL */
  currentUrl?: string | null;
  /** User's name for fallback initials */
  name: string;
  /** Storage path prefix: 'teachers' or 'members' */
  folder: 'teachers' | 'members';
  /** Entity ID for unique file naming */
  entityId: string;
  /** Callback with new public URL after upload */
  onUpload: (url: string) => void;
  /** Size variant */
  size?: 'md' | 'lg';
}

export function AvatarUpload({ currentUrl, name, folder, entityId, onUpload, size = 'lg' }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sizeClasses = size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';
  const iconSize = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';

  const displayUrl = previewUrl || currentUrl;

  // Get initials from name
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('파일 크기는 2MB 이하여야 합니다');
      return;
    }

    // Show preview immediately
    setPreviewUrl(URL.createObjectURL(file));

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${folder}/${entityId}.${ext}`;

      // Upload to Supabase Storage (upsert to overwrite existing)
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Append cache buster
      const finalUrl = `${publicUrl}?t=${Date.now()}`;
      onUpload(finalUrl);
      toast.success('사진이 업로드되었습니다');
    } catch {
      toast.error('사진 업로드 실패');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={`relative ${sizeClasses} rounded-full overflow-hidden border-2 border-gray-200 hover:border-indigo-400 transition-colors group`}
      >
        {displayUrl ? (
          <img src={displayUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-indigo-100 flex items-center justify-center">
            <span className="text-indigo-600 font-bold text-lg">{initials}</span>
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className={`${iconSize} text-white`} />
        </div>
        {/* Loading spinner */}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <span className="text-xs text-gray-400">
        {uploading ? '업로드 중...' : '클릭하여 사진 변경'}
      </span>
    </div>
  );
}
