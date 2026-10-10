import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, ArrowUpRight } from "lucide-react";
export function RegistrationQR({
  slug,
  download = false,
}: {
  slug: string;
  download?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const url = `${window.location.origin}/event/${slug}/register`;
  function save() {
    const canvas = container.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${slug}-qr.png`;
    a.click();
  }
  return (
    <div className="qr-block">
      <div ref={container} className="qr-code">
        <QRCodeCanvas value={url} size={224} marginSize={3} level="M" />
      </div>
      <p>
        Сканируйте QR-код
        <br />
        <span className="muted">и присоединяйтесь к розыгрышу</span>
      </p>
      {download && (
        <div className="button-row">
          <button className="button secondary" onClick={save}>
            <Download size={16} /> Скачать PNG
          </button>
          <a className="text-link" href={url} target="_blank" rel="noreferrer">
            Регистрация <ArrowUpRight size={16} />
          </a>
        </div>
      )}
    </div>
  );
}
