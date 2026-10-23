import { ScrollView } from 'react-native';

import { useWorkspace } from '@/features/workspace/use-workspace';
import { WorkspaceChooser } from '@/features/workspace/workspace-chooser';

/** Two workspaces and no choice yet: the operator picks one, and the root layout opens it. */
export default function ChooseWorkspace() {
  const state = useWorkspace();
  if (state.status !== 'choose') return null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-safe-offset-10 pb-safe-offset-6">
      <WorkspaceChooser
        workspaces={state.workspaces}
        onChoose={(access) => state.chooseWorkspace(access.workspace)}
      />
    </ScrollView>
  );
}
