import { LoginButton } from "./login-button";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 bg-brand-yellow p-6">
      <div>
        <h1 className="text-5xl font-black uppercase leading-none tracking-tight">
          TCG
          <br />
          Buddy
        </h1>
        <p className="mt-3 font-medium">
          Tieni traccia di tornei e risultati dei tuoi giochi di carte.
        </p>
      </div>
      <div className="brutal-card p-4">
        <LoginButton />
      </div>
    </main>
  );
}
