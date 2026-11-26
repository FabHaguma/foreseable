import { mountFeedback, flush, unmountFeedback } from './feedback.js';
import { icons } from './api.js';

// Add each future app here, with its own module and mount/unmount functions.
// The shared header, tabs, authentication and storage stay in one workspace.
export const apps = [{
  id: 'calls', title: 'Feedback calls', description: 'Turn your call list into useful conversations.',
  icon: icons.phone, mount: mountFeedback, beforeLeave: flush, unmount: unmountFeedback
}];
