import Image from "next/image";
import { LoginButton } from "./login-button";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 bg-brand-yellow p-6">
      <div className="space-y-3">
        <Image
          src="/logo.png"
          alt="Ohara TCG Buddy"
          width={192}
          height={192}
          priority
          className="mx-auto h-auto w-48"
        />
        <h1 className="sr-only">Ohara TCG Buddy</h1>
        <p className="text-center font-medium">
          Tieni traccia di tornei e risultati dei tuoi giochi di carte.
        </p>
      </div>
      <div className="brutal-card p-4">
        <LoginButton />
      </div>
    </main>
  );
}
