export default function ComputerLoading() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-56px)] md:h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-pplx-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-pplx-muted">Loading...</p>
      </div>
    </div>
  );
}
