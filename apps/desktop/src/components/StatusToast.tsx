type StatusToastProps = {
  message: string;
  error: string;
};

export function StatusToast({ message, error }: StatusToastProps) {
  if (!message && !error) return null;

  return (
    <div className="status-toast">
      {message ? <span>{message}</span> : null}
      {error ? <span className="status-error">{error}</span> : null}
    </div>
  );
}
