import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Channel, ChannelFileKind, ChannelPatch } from "../types/api";

/** The channel's branding (logo, name, font, screen lengths) - app-wide, shared by every project. */
export function useChannel() {
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    api.getChannel().then(setChannel).catch(() => {});
  }, []);

  const update = useCallback(async (patch: ChannelPatch) => setChannel(await api.updateChannel(patch)), []);
  const uploadFile = useCallback(async (kind: ChannelFileKind, file: File) => setChannel(await api.uploadChannelFile(kind, file)), []);
  const removeFile = useCallback(async (kind: ChannelFileKind) => setChannel(await api.removeChannelFile(kind)), []);

  const configured = Boolean(channel && (channel.name.trim() || channel.hasLogo));
  return { channel, configured, update, uploadFile, removeFile };
}
