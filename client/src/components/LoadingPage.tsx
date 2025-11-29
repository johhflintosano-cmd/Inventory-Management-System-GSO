import { Loader2 } from "lucide-react";
import dwcsjSeal from "@assets/DWCSJ_Seal_1764053138127.png";

export default function LoadingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-6">
        <div className="space-y-4">
          <img src={dwcsjSeal} alt="DWCSJ Seal" className="w-32 h-32 mx-auto" />
          <h1 className="text-4xl font-bold text-foreground">DWCSJ</h1>
          <p className="text-lg text-muted-foreground">Divine Word College of San Jose</p>
          <p className="text-sm text-muted-foreground">Inventory Management System</p>
        </div>
        <div className="flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
        <div className="w-64 h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse w-3/4"></div>
        </div>
      </div>
    </div>
  );
}
