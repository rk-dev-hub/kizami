"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    null,
  );
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {state?.error ? (
        <p
          className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        label="メールアドレス"
        htmlFor="email"
        error={state?.fields?.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!state?.fields?.email}
        />
      </Field>

      <Field
        label="パスワード"
        htmlFor="password"
        error={state?.fields?.password}
      >
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-10"
            aria-invalid={!!state?.fields?.password}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center"
            aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
    </form>
  );
}
