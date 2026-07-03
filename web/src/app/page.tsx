export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-teal-700">PDF 악보 - MXL 변환</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
        API 준비 완료
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-700">
        업로드 UI는 다음 단계에서 연결됩니다. 현재는 <code>/api/jobs</code> API로 PDF 검증,
        큐 등록, 상태 조회, 다운로드를 처리합니다.
      </p>
    </main>
  );
}

