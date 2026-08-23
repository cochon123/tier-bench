import { SignIn } from "@clerk/nextjs";
import { Footer, Header } from "../../components";

export default function LoginPage() {
  return <><Header /><main className="page-shell login-page"><SignIn routing="path" path="/login" signUpUrl="/signup" /></main><Footer /></>;
}
