import { NotFoundView, type NotFoundTexts } from "@/components/site/NotFoundView";
import { href } from "@/i18n/href";
import { getDict, type Locale } from "@/i18n/locales";

function texts(l: Locale): NotFoundTexts {
  const d = getDict(l);
  return {
    title: d.notFound.title,
    text: d.notFound.text,
    links: [
      { href: href(l, "/"), label: d.notFound.home },
      { href: href(l, "/koolitused"), label: d.footer.allCourses },
    ],
  };
}

// Localized 404 inside the site shell (header + footer come from (site)/layout.tsx).
export default function NotFound() {
  return <NotFoundView texts={{ et: texts("et"), ru: texts("ru") }} />;
}
