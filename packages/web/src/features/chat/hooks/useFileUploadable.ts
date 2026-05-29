import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router';
import { FILE_LIMIT } from '@/features/chat/constants';
import { useChat } from '@/hooks/useChat';
import { MODELS } from '@/models';

export const useFileUploadable = () => {
  const { chatId } = useParams();
  const { pathname } = useLocation();

  const { getModelId } = useChat(pathname, chatId);
  const modelId = getModelId();

  const accept = useMemo(() => {
    if (!modelId) return [];
    const meta = MODELS.modelMetadata[modelId];
    if (!meta || !meta.flags) return [];
    const feature = meta.flags;
    return [
      ...(feature.doc ? FILE_LIMIT.accept.doc : []),
      ...(feature.image ? FILE_LIMIT.accept.image : []),
      ...(feature.video ? FILE_LIMIT.accept.video : []),
    ];
  }, [modelId]);

  return { accept, fileUploadable: accept.length > 0 };
};