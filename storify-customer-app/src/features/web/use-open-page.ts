import { useRouter } from 'expo-router';

/** Opens a web page inside the app (`/web`), with the header's title when the caller knows it. */
export function useOpenPage(): (url: string, title?: string) => void {
  const router = useRouter();
  return (url, title) =>
    router.push({ pathname: '/web', params: title ? { url, title } : { url } });
}
