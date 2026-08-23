import { SignUp } from "@clerk/nextjs";
import { Footer, Header } from "../../components";

export default function SignupPage() {
  return <><Header /><main className="page-shell login-page"><SignUp routing="path" path="/signup" signInUrl="/login" /></main><Footer /></>;
}
