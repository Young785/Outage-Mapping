import { redirect } from 'next/navigation';

export default function OutagesRedirect() {
  redirect('/?tab=outages');
}
