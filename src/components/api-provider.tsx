import React, {
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState
} from 'react';
import {
  APIOptions,
  importLibrary as importGoogleMapsLibrary,
  setOptions as setGoogleMapsOptions
} from '@googlemaps/js-api-loader';
import {APILoadingStatus} from '../libraries/api-loading-status';
import {VERSION} from '../version';

type ImportLibraryFunction = typeof google.maps.importLibrary;
type GoogleMapsLibrary = Awaited<ReturnType<ImportLibraryFunction>>;
type LoadedLibraries = {[name: string]: GoogleMapsLibrary};

export interface APIProviderContextValue {
  status: APILoadingStatus;
  loadedLibraries: LoadedLibraries;
  importLibrary: typeof google.maps.importLibrary;
  mapInstances: Record<string, google.maps.Map>;
  addMapInstance: (map: google.maps.Map, id?: string) => void;
  removeMapInstance: (id?: string) => void;
  clearMapInstances: () => void;
  internalUsageAttributionIds: string[] | null;
}

const DEFAULT_VERSION = 'weekly';
const DEFAULT_SOLUTION_CHANNEL = 'GMP_visgl_rgmlibrary_v1_default';
const DEFAULT_INTERNAL_USAGE_ATTRIBUTION_IDS = [
  `gmp_visgl_reactgooglemaps_v${VERSION}`
];
const DEFAULT_AUTH_REFERRER_POLICY = 'origin';

export const APIProviderContext =
  React.createContext<APIProviderContextValue | null>(null);

export type APIProviderProps = PropsWithChildren<{
  /**
   * apiKey must be provided to load the Google Maps JavaScript API. To create an API key, see: https://developers.google.com/maps/documentation/javascript/get-api-key
   * Part of:
   */
  apiKey: string;
  /**
   * A custom id to reference the script tag can be provided. The default is set to 'google-maps-api'
   * @default 'google-maps-api'
   */
  libraries?: Array<string>;
  /**
   * A specific version of the Google Maps JavaScript API can be used.
   * Read more about versioning: https://developers.google.com/maps/documentation/javascript/versions
   * Part of: https://developers.google.com/maps/documentation/javascript/url-params
   */
  version?: string;
  /**
   * Sets the map to a specific region.
   * Read more about localizing the Map: https://developers.google.com/maps/documentation/javascript/localization
   * Part of: https://developers.google.com/maps/documentation/javascript/url-params
   */
  region?: string;
  /**
   * Use a specific language for the map.
   * Read more about localizing the Map: https://developers.google.com/maps/documentation/javascript/localization
   * Part of: https://developers.google.com/maps/documentation/javascript/url-params
   */
  language?: string;
  /**
   * auth_referrer_policy can be set to 'origin'.
   * Part of: https://developers.google.com/maps/documentation/javascript/url-params
   */
  authReferrerPolicy?: string;
  /**
   * To track usage of Google Maps JavaScript API via numeric channels.
   * The only acceptable channel values are numbers from 0-999.
   * Read more in the
   * [documentation](https://developers.google.com/maps/reporting-and-monitoring/reporting#usage-tracking-per-channel)
   */
  channel?: number;
  /**
   * To understand usage and ways to improve our solutions, Google includes the
   * `solution_channel` query parameter in API calls to gather information about
   * code usage. You may opt out at any time by setting this attribute to an
   * empty string. Read more in the
   * [documentation](https://developers.google.com/maps/reporting-and-monitoring/reporting#solutions-usage).
   */
  solutionChannel?: string;
  /**
   * To help Google understand which libraries and samples are helpful to developers, such as usage of this library.
   * To opt out of sending the usage attribution ID, use this boolean prop. Read more in the
   * [documentation](https://developers.google.com/maps/documentation/javascript/reference/map#MapOptions.internalUsageAttributionIds).
   */
  disableUsageAttribution?: boolean;
  /**
   * A function that can be used to execute code after the Google Maps JavaScript API has been loaded.
   */
  onLoad?: () => void;
  /**
   * A function that will be called if there was an error when loading the Google Maps JavaScript API.
   */
  onError?: (error: unknown) => void;
}>;

/**
 * local hook to set up the map-instance management context.
 */
function useMapInstances() {
  const [mapInstances, setMapInstances] = useState<
    Record<string, google.maps.Map>
  >({});

  const addMapInstance = (mapInstance: google.maps.Map, id = 'default') => {
    setMapInstances(instances => ({...instances, [id]: mapInstance}));
  };

  const removeMapInstance = (id = 'default') => {
    setMapInstances(({[id]: _, ...remaining}) => remaining);
  };

  const clearMapInstances = () => {
    setMapInstances({});
  };

  return {mapInstances, addMapInstance, removeMapInstance, clearMapInstances};
}

/**
 * local hook to handle the loading of the maps API, returns the current loading status
 * @param props
 */
function useGoogleMapsApiLoader({
  onLoad,
  onError,
  apiKey,
  region,
  language,
  channel,
  solutionChannel,
  libraries = [],
  version = DEFAULT_VERSION,
  authReferrerPolicy = DEFAULT_AUTH_REFERRER_POLICY
}: Omit<APIProviderProps, 'children'>) {
  const [prevOptions, setPrevOptions] = useState<APIOptions | null>(null);
  const [status, setStatus] = useState<APILoadingStatus>(
    APILoadingStatus.NOT_LOADED
  );

  const [loadedLibraries, addLoadedLibrary] = useReducer(
    (
      loadedLibraries: LoadedLibraries,
      action: {name: keyof LoadedLibraries; value: LoadedLibraries[string]}
    ) => {
      return loadedLibraries[action.name]
        ? loadedLibraries
        : {...loadedLibraries, [action.name]: action.value};
    },
    {}
  );

  const importLibrary: typeof google.maps.importLibrary = useCallback(
    async (name: string) => {
      if (loadedLibraries[name]) {
        return loadedLibraries[name];
      }

      const res = await importGoogleMapsLibrary(name);
      addLoadedLibrary({name, value: res});

      return res;
    },
    [loadedLibraries]
  );

  const options: APIOptions = useMemo(
    () => ({
      key: apiKey,
      v: version,
      region,
      language,
      authReferrerPolicy,
      libraries,
      channel: channel !== undefined ? String(channel) : undefined,
      solutionChannel:
        solutionChannel === ''
          ? undefined
          : solutionChannel || DEFAULT_SOLUTION_CHANNEL
    }),
    [
      apiKey,
      version,
      region,
      language,
      authReferrerPolicy,
      libraries,
      channel,
      solutionChannel
    ]
  );

  useEffect(() => {
    const optionsChanged =
      JSON.stringify(prevOptions) !== JSON.stringify(options);
    if (optionsChanged) {
      setGoogleMapsOptions(options);
      setPrevOptions(options);
    }
  }, [options, prevOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus(APILoadingStatus.LOADING);

        for (const name of ['core', 'maps']) {
          await importGoogleMapsLibrary(name);
        }

        if (cancelled) return;

        if (libraries) {
          for (const name of libraries) {
            await importLibrary(name);
          }
        }

        if (cancelled) return;

        setStatus(APILoadingStatus.LOADED);

        if (onLoad) {
          onLoad();
        }
      } catch (error) {
        if (cancelled) return;

        setStatus(APILoadingStatus.FAILED);

        if (onError) {
          onError(error);
        } else {
          console.error(
            '<ApiProvider> failed to load the Google Maps JavaScript API',
            error
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    loadedLibraries,
    importLibrary
  };
}

function useInternalUsageAttributionIds(props: APIProviderProps) {
  const internalUsageAttributionIds = useMemo(
    () =>
      props.disableUsageAttribution
        ? null
        : DEFAULT_INTERNAL_USAGE_ATTRIBUTION_IDS,
    [props.disableUsageAttribution]
  );

  return internalUsageAttributionIds;
}

/**
 * Component to wrap the components from this library and load the Google Maps JavaScript API
 */
export const APIProvider: FunctionComponent<APIProviderProps> = props => {
  const {children, ...loaderProps} = props;
  const {mapInstances, addMapInstance, removeMapInstance, clearMapInstances} =
    useMapInstances();

  const {status, loadedLibraries, importLibrary} =
    useGoogleMapsApiLoader(loaderProps);

  const internalUsageAttributionIds =
    useInternalUsageAttributionIds(loaderProps);

  const contextValue: APIProviderContextValue = useMemo(
    () => ({
      mapInstances,
      addMapInstance,
      removeMapInstance,
      clearMapInstances,
      status,
      loadedLibraries,
      importLibrary,
      internalUsageAttributionIds
    }),
    [
      mapInstances,
      addMapInstance,
      removeMapInstance,
      clearMapInstances,
      status,
      loadedLibraries,
      importLibrary,
      internalUsageAttributionIds
    ]
  );

  return (
    <APIProviderContext.Provider value={contextValue}>
      {children}
    </APIProviderContext.Provider>
  );
};
