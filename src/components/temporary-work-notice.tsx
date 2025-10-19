"use client";

import { Alert, AlertDescription } from "ui/alert";
import { Button } from "ui/button";
import { Info, LogIn } from "lucide-react";
import Link from "next/link";

export function TemporaryWorkNotice() {
  return (
    <Alert className="m-4 border-brand-orange/20 bg-brand-orange/5 dark:border-brand-orange/30 dark:bg-brand-orange/10">
      <Info className="h-4 w-4 text-brand-orange" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-brand-charcoal dark:text-brand-cream">
          <strong>Temporary Session:</strong> Your work won&apos;t be saved.
          Sign in to save your projects and estimates.
        </span>
        <Link href="/sign-in">
          <Button
            variant="outline"
            size="sm"
            className="ml-4 flex items-center gap-2 border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white"
          >
            <LogIn className="h-3 w-3" />
            Sign In
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
