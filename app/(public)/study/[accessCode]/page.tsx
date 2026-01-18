/**
 * /study/[accessCode]
 *
 * Purpose:
 * - Convenience route: always forward to /resume
 * - Later we could also show a tiny "loading/resuming" screen here.
 */
import {redirect} from "next/navigation";

export default function StudyAccessCodeIndexPage({
                                                     params,
                                                 }: {
    params: { accessCode: string };
}) {
    redirect(`/study/${params.accessCode}/resume`);
}
