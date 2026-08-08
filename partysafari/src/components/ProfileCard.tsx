interface Profile {
  id: string;
  type: 'user' | 'business' | 'entertainer';
  name: string;
  username: string;
  avatar: string;
  bio: string;
  location: string;
  stats: any;
}

interface ProfileCardProps {
  profile: Profile;
  compact?: boolean;
}

export default function ProfileCard({ profile, compact = false }: ProfileCardProps) {
  const getPrimaryStat = () => {
    switch (profile.type) {
      case 'user':
        return { value: profile.stats.followers, label: 'Followers' };
      case 'business':
        return { value: profile.stats.rating, label: 'Rating' };
      case 'entertainer':
        return { value: profile.stats.followers, label: 'Followers' };
      default:
        return { value: 0, label: '' };
    }
  };

  const getActionButtons = () => {
    const baseClasses = "min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition";
    const followButton = `${baseClasses} border border-violet-500/50 bg-violet-500/10 text-violet-200 hover:border-violet-300 hover:bg-violet-500/20`;
    const messageButton = `${baseClasses} bg-violet-600 text-white hover:bg-violet-500`;
    const bookButton = `${baseClasses} border border-white/20 bg-white/10 text-white hover:bg-white/20`;

    switch (profile.type) {
      case 'user':
        return (
          <div className="flex flex-wrap gap-2">
            <button className={followButton}>Follow</button>
            <button className={messageButton}>Message</button>
          </div>
        );
      case 'business':
        return (
          <div className="flex flex-wrap gap-2">
            <button className={followButton}>Follow</button>
            <button className={messageButton}>Message</button>
            <button className={bookButton}>Book</button>
          </div>
        );
      case 'entertainer':
        return (
          <div className="flex flex-wrap gap-2">
            <button className={followButton}>Follow</button>
            <button className={messageButton}>Message</button>
            <button className={bookButton}>Book</button>
          </div>
        );
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-3 rounded-3xl border border-white/10 bg-[#10061f] p-4 sm:gap-4">
        <img
          src={profile.avatar}
          alt={profile.name}
          className="h-12 w-12 shrink-0 rounded-full border-2 border-violet-500/20"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white">{profile.name}</h3>
          <p className="truncate text-sm text-violet-300">{profile.username}</p>
          <p className="break-words text-sm text-white/60">{profile.location}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-white">{getPrimaryStat().value}</div>
          <div className="text-xs text-white/60">{getPrimaryStat().label}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-[#10061f] p-4 shadow-xl shadow-violet-900/20 sm:p-6">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <img
          src={profile.avatar}
          alt={profile.name}
          className="h-14 w-14 shrink-0 rounded-full border-4 border-violet-500/20 sm:h-16 sm:w-16"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-lg font-semibold text-white sm:text-xl">{profile.name}</h3>
              <p className="break-all text-violet-300">{profile.username}</p>
              <p className="mt-1 break-words text-sm text-white/60">📍 {profile.location}</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold text-white">{getPrimaryStat().value}</div>
              <div className="text-sm text-white/60">{getPrimaryStat().label}</div>
            </div>
          </div>
          <p className="mt-3 line-clamp-2 break-words text-sm text-white/70">{profile.bio}</p>
          <div className="mt-4 max-w-full">
            {getActionButtons()}
          </div>
        </div>
      </div>
    </div>
  );
}
