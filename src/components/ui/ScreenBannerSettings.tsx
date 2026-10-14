import { useEffect, useState } from "react";
import { assetUrl } from "../../services/events";
import type { Event } from "../../types/database";

export function ScreenBannerSettings({ event }: { event: Event }) {
  const [enabled, setEnabled] = useState(event.screen_banner_enabled ?? false);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const image = preview || assetUrl(event.screen_banner_path);
  return (
    <div className="full screen-banner-settings">
      <h2 className="form-divider">Реклама на большом экране</h2>
      <label className="checkbox-label">
        <input
          name="screen_banner_enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        Разделить экран и показывать рекламный баннер
      </label>
      <p className="muted">
        Слева — розыгрыш, справа — ваш баннер. Обе части занимают половину экрана.
        Если выключить режим, розыгрыш займёт весь экран, а баннер сохранится.
      </p>
      <label>
        Рекламный баннер
        <input
          name="screen_banner"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required={enabled && !event.screen_banner_path}
          aria-describedby="screen-banner-help"
          onChange={(e) => setFile(e.currentTarget.files?.[0])}
        />
      </label>
      <p className="muted" id="screen-banner-help">
        PNG, JPEG или WebP до 5 МБ. Для экрана 16:9 рекомендуем вертикальный баннер 8:9.
        Изображение показывается целиком, без обрезки. Для замены выберите новый файл.
      </p>
      {image && <img className="screen-banner-preview" src={image} alt="Предпросмотр рекламного баннера" />}
    </div>
  );
}
