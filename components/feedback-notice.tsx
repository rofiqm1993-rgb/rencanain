"use client";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export default function FeedbackNotice({ message, warning = false, onRetry, retryLabel = "Coba lagi" }: { message: string; warning?: boolean; onRetry?: () => void; retryLabel?: string }) {
  return <Alert className="feedback-notice" role={warning ? "status" : "alert"}>{warning ? <Info /> : <AlertCircle />}<AlertDescription><p>{message}</p>{onRetry && <Button variant="outline" size="sm" onClick={onRetry}>{retryLabel}</Button>}</AlertDescription></Alert>;
}
