import { createContext, useContext, useState, type ReactNode } from 'react';
import { MemberProfileCard } from '../components/MemberProfileCard';

interface MemberProfileContextType {
  openMemberProfile: (memberId: string) => void;
}

const MemberProfileContext = createContext<MemberProfileContextType>({
  openMemberProfile: () => {},
});

export function useMemberProfile() {
  return useContext(MemberProfileContext);
}

export function MemberProfileProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState<string | null>(null);

  return (
    <MemberProfileContext.Provider value={{ openMemberProfile: setMemberId }}>
      {children}
      {memberId && (
        <MemberProfileCard
          memberId={memberId}
          onClose={() => setMemberId(null)}
        />
      )}
    </MemberProfileContext.Provider>
  );
}
