import { IconPhone, IconPin, IconStore, IconUser } from "@/components/dashboard/Icons";

export const AuthUserIcon = () => <IconUser width={17} height={17} />;
export const AuthPhoneIcon = () => <IconPhone width={17} height={17} />;
export const AuthStoreIcon = () => <IconStore width={17} height={17} />;
export const AuthPinIcon = () => <IconPin width={17} height={17} />;

export const AuthMailIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const AuthLockIcon = ({ shield = false }: { shield?: boolean }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
    {shield ? (
      <path d="M12 3 5 6v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    ) : (
      <path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12a2 2 0 0 1 2 2v8H4v-8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);
