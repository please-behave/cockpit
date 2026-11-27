import { html, render } from 'lit';
import { statusPillLabels } from '../../tools/preview/fixtures.mjs';
import './components/pb-status-pill';

render(statusPillLabels.map(status => html`
  <tr>
    <td><pb-status-pill status=${status}></pb-status-pill></td>
    <td><pb-status-pill variant="compact" status=${status}></pb-status-pill></td>
  </tr>
`), document.querySelector('tbody')!);
