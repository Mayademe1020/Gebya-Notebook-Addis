export const MAX_PROOF_PHOTOS = 3;

export function createPhotoProof(dataUrl, takenAt = Date.now()) {
  if (!dataUrl) return null;
  return {
    id: `photo-${takenAt}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    taken_at: takenAt,
  };
}

export function normalizePhotos(input) {
  const source = Array.isArray(input)
    ? input
    : Array.isArray(input?.photos)
      ? input.photos
      : [];

  const photos = source
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return { id: `photo-${index}`, dataUrl: entry, taken_at: null };
      }
      if (!entry?.dataUrl) return null;
      return {
        id: entry.id || `photo-${index}`,
        dataUrl: entry.dataUrl,
        taken_at: entry.taken_at || null,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PROOF_PHOTOS);

  if (photos.length > 0) return photos;

  const legacyPhoto = Array.isArray(input) ? null : input?.photo;
  if (!legacyPhoto) return [];

  return [{
    id: 'legacy-photo',
    dataUrl: legacyPhoto,
    taken_at: input?.photo_taken_at || input?.created_at || input?.updated_at || null,
  }];
}

export function buildPhotoFields(photosInput) {
  const photos = normalizePhotos(photosInput);
  const first = photos[0] || null;
  return {
    photos,
    photo: first?.dataUrl || null,
    photo_taken_at: first?.taken_at || null,
  };
}

export function canAddPhoto(photosInput) {
  return normalizePhotos(photosInput).length < MAX_PROOF_PHOTOS;
}
