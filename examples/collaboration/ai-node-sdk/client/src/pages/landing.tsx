import { Bot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateRoomForm } from '@/components/landing/create-room-form';
import { JoinRoomForm } from '@/components/landing/join-room-form';

export function LandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">SuperDoc AI Agent</CardTitle>
          <CardDescription>
            Create a collaborative room where an AI agent edits documents alongside you in real time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create">
            <TabsList className="w-full">
              <TabsTrigger value="create" className="flex-1">
                Create Room
              </TabsTrigger>
              <TabsTrigger value="join" className="flex-1">
                Join Room
              </TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="mt-4">
              <CreateRoomForm />
            </TabsContent>
            <TabsContent value="join" className="mt-4">
              <JoinRoomForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
