import type { RouteObject } from 'react-router';
import AppLayout from './appLayout';
import OverviewPage from './pages/OverviewPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import ConvertLeadPage from './pages/ConvertLeadPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import UnitsPage from './pages/UnitsPage';
import UnitDetailPage from './pages/UnitDetailPage';
import EoisPage from './pages/EoisPage';
import NewEoiPage from './pages/NewEoiPage';
import EoiDetailPage from './pages/EoiDetailPage';
import CommissionPage from './pages/CommissionPage';
import NotFound from './pages/NotFound';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'leads/:id', element: <LeadDetailPage /> },
      { path: 'leads/:id/convert', element: <ConvertLeadPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'units', element: <UnitsPage /> },
      { path: 'units/:id', element: <UnitDetailPage /> },
      { path: 'eois', element: <EoisPage /> },
      { path: 'eois/new', element: <NewEoiPage /> },
      { path: 'eois/:id', element: <EoiDetailPage /> },
      { path: 'commission', element: <CommissionPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
