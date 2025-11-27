import React, {useContext} from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';
import {initialize} from '@googlemaps/jest-mocks';
import '@testing-library/jest-dom';
import {VERSION} from '../../version';
import {
  APIProvider,
  APIProviderContext,
  APIProviderContextValue
} from '../api-provider';
import {useApiIsLoaded} from '../../hooks/use-api-is-loaded';
import {APILoadingStatus} from '../../libraries/api-loading-status';

const setOptionsSpy = jest.fn();
const importLibrarySpy = jest.fn();

const ContextSpyComponent = () => {
  const context = useContext(APIProviderContext);
  ContextSpyComponent.spy(context);

  return <></>;
};
ContextSpyComponent.spy = jest.fn();

jest.mock('@googlemaps/js-api-loader', () => {
  return {
    setOptions: (options: unknown) => {
      setOptionsSpy(options);
    },
    importLibrary: jest.fn(async (name: string) => {
      importLibrarySpy(name);
      // Return empty object - the @googlemaps/jest-mocks will handle setting up google.maps
      return {};
    })
  };
});

beforeEach(() => {
  initialize();
  jest.clearAllMocks();
});

test('passes parameters to setOptions', async () => {
  await act(async () => {
    render(
      <APIProvider
        apiKey={'apikey'}
        libraries={['places', 'marker']}
        version={'beta'}
        language={'en'}
        region={'us'}
        solutionChannel={'test-channel_value'}
        authReferrerPolicy={'origin'}></APIProvider>
    );
  });

  expect(setOptionsSpy.mock.lastCall[0]).toMatchObject({
    key: 'apikey',
    libraries: ['places', 'marker'],
    v: 'beta',
    language: 'en',
    region: 'us',
    solutionChannel: 'test-channel_value',
    authReferrerPolicy: 'origin'
  });
});

test('passes parameters to setOptions', async () => {
  await act(async () => {
    render(<APIProvider apiKey={'apikey'} version={'version'}></APIProvider>);
  });

  const actual = setOptionsSpy.mock.lastCall[0];
  expect(actual).toMatchObject({key: 'apikey', v: 'version'});
});

test('uses default solutionChannel', async () => {
  await act(async () => {
    render(<APIProvider apiKey={'apikey'}></APIProvider>);
  });

  const actual = setOptionsSpy.mock.lastCall[0] as Record<string, unknown>;
  expect(actual.solutionChannel).toBe('GMP_visgl_rgmlibrary_v1_default');
});

test("doesn't set solutionChannel when specified as empty string", async () => {
  await act(async () => {
    render(<APIProvider apiKey={'apikey'} solutionChannel={''}></APIProvider>);
  });

  const actual = setOptionsSpy.mock.lastCall[0] as Record<string, unknown>;
  expect(actual.solutionChannel).toBeUndefined();
});

test('renders inner components', async () => {
  const LoadingStatus = () => {
    const mapsLoaded = useApiIsLoaded();
    return (
      <span data-testid="status">{mapsLoaded ? 'loaded' : 'not loaded'}</span>
    );
  };

  render(
    <APIProvider apiKey={'apikey'}>
      <LoadingStatus />
    </APIProvider>
  );

  // Should start as not loaded
  expect(screen.getByTestId('status')).toHaveTextContent('not loaded');

  // Wait for async loading to complete
  await waitFor(() => {
    expect(screen.getByTestId('status')).toHaveTextContent('loaded');
  });
});

test('provides context values', async () => {
  render(
    <APIProvider apiKey={'apikey'}>
      <ContextSpyComponent />
    </APIProvider>
  );

  const contextSpy = ContextSpyComponent.spy;
  expect(contextSpy).toHaveBeenCalled();
  let actualContext: APIProviderContextValue = contextSpy.mock.lastCall[0];

  expect(actualContext.status).toEqual(APILoadingStatus.LOADING);
  expect(actualContext.mapInstances).toEqual({});

  // Wait for loading to complete
  await waitFor(() => {
    actualContext = contextSpy.mock.lastCall[0];
    expect(actualContext.status).toBe(APILoadingStatus.LOADED);
  });
});

test('map instance management: add, access and remove', async () => {
  await act(async () => {
    render(
      <APIProvider apiKey={'apikey'}>
        <ContextSpyComponent />
      </APIProvider>
    );
  });

  const contextSpy = ContextSpyComponent.spy;

  let actualContext: APIProviderContextValue = contextSpy.mock.lastCall[0];
  const map1 = new google.maps.Map(null as unknown as HTMLElement);
  const map2 = new google.maps.Map(null as unknown as HTMLElement);

  contextSpy.mockReset();
  await act(() => {
    actualContext.addMapInstance(map1, 'map-id-1');
    actualContext.addMapInstance(map2, 'map-id-2');
  });

  expect(contextSpy).toHaveBeenCalled();

  actualContext = contextSpy.mock.lastCall[0];
  expect(actualContext.mapInstances['map-id-1']).toBe(map1);
  expect(actualContext.mapInstances['map-id-2']).toBe(map2);

  contextSpy.mockReset();
  await act(() => {
    actualContext.removeMapInstance('map-id-1');
  });

  actualContext = contextSpy.mock.lastCall[0];
  expect(actualContext.mapInstances).toEqual({'map-id-2': map2});
});

test('calls onError when loading the Google Maps JavaScript API fails', async () => {
  const onErrorMock = jest.fn();
  const mockError = new Error('Loading failed');

  // Make importLibrary reject for this test
  const loader = await import('@googlemaps/js-api-loader');
  (loader.importLibrary as jest.Mock).mockRejectedValueOnce(mockError);

  await act(async () => {
    render(<APIProvider apiKey={'apikey'} onError={onErrorMock}></APIProvider>);
  });

  await waitFor(() => {
    expect(onErrorMock).toHaveBeenCalledWith(mockError);
  });
});

describe('internalUsageAttributionIds', () => {
  test('provides default attribution IDs in context', async () => {
    await act(async () => {
      render(
        <APIProvider apiKey={'apikey'}>
          <ContextSpyComponent />
        </APIProvider>
      );
    });

    const contextSpy = ContextSpyComponent.spy;
    const actualContext: APIProviderContextValue = contextSpy.mock.lastCall[0];

    expect(actualContext.internalUsageAttributionIds).toEqual([
      `gmp_visgl_reactgooglemaps_v${VERSION}`
    ]);
  });

  test('sets internalUsageAttributionIds to null when disableUsageAttribution is true', async () => {
    await act(async () => {
      render(
        <APIProvider apiKey={'apikey'} disableUsageAttribution>
          <ContextSpyComponent />
        </APIProvider>
      );
    });

    const contextSpy = ContextSpyComponent.spy;
    const actualContext: APIProviderContextValue = contextSpy.mock.lastCall[0];

    expect(actualContext.internalUsageAttributionIds).toBeNull();
  });
});
