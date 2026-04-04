import { useEffect, useState } from "react";
import defaultAvatarUrl from "../assets/discasa-default-avatar.png";

type ProfileAvatarProps = {
  avatarUrl: string | null;
  className: string;
};

export function ProfileAvatar({ avatarUrl, className }: ProfileAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [avatarUrl]);

  const showDiscordAvatar = Boolean(avatarUrl) && !hasImageError;

  return (
    <div className={`${className} avatar-base ${showDiscordAvatar ? "has-discord-avatar" : ""}`} aria-hidden="true">
      {showDiscordAvatar ? (
        <img src={avatarUrl ?? undefined} alt="" className="avatar-image" onError={() => setHasImageError(true)} />
      ) : (
        <div className="avatar-fallback">
          <span className="avatar-fallback-background" />
          <img src={defaultAvatarUrl} alt="" className="avatar-fallback-image" />
        </div>
      )}
    </div>
  );
}
