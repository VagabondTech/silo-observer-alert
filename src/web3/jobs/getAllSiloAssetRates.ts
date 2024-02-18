import { Contract as MulticallContract } from 'ethers-multicall';

import { Contract, utils } from 'ethers';

import BigNumber from 'bignumber.js';

import {
  SILO_LENS_ADDRESS,
  SILO_LENS_ADDRESS_LLAMA,
  SILO_LENS_ADDRESS_ARBITRUM,
} from "../../constants";

import {
  multicallProviderRetryOnFailure,
} from '../utils';

import SiloFactoryABI from '../abis/SiloFactoryABI.json';
import SiloABI from '../abis/SiloABI.json';
import ERC20ABI from '../abis/ERC20ABI.json';
import SiloLensABI from '../abis/SiloLensABI.json';
import SiloLensLlamaABI from '../abis/SiloLensLlamaABI.json';

import {
  IDeployment,
} from '../../interfaces';

BigNumber.config({ EXPONENTIAL_AT: [-1e+9, 1e+9] });

interface IAllSiloAssetRateResults {
  [key: string]: IAllSiloAssetRates[]
}

interface IAllSiloAssetRates {
  rate: string
  side: string
  tokenAddress: string
}

export const getAllSiloAssetRates = async (siloAddresses: string [], allSiloAddressesWithOpenPositions: string [], siloAddressToSiloAssets: {[key: string]: string[]}, allSiloAssetsWithState: string[][], deploymentConfig: IDeployment) => {

  const indexedSiloAddresses : string[] = siloAddresses;

  let siloIndex = 0;
  let queryIndexToSiloAddress : string[] = [];
  let siloAssetToSiloAddressIndex : string[] = [];
  for(let singleSiloAssetsWithState of allSiloAssetsWithState) {
    let siloAddress = indexedSiloAddresses[siloIndex];
    for(let singleSiloAsset of singleSiloAssetsWithState) {
      if(allSiloAddressesWithOpenPositions.indexOf(siloAddress) > -1) {
        queryIndexToSiloAddress.push(siloAddress);
      }
      siloAssetToSiloAddressIndex.push(siloAddress);
    }
    siloIndex++;
  }

  let flattenedTokenAddresses = allSiloAssetsWithState.flat();
  let tokenQueryIndex = 0;
  const tokenContracts = flattenedTokenAddresses.map((tokenAddress, tokenIndex) => {
    if(allSiloAddressesWithOpenPositions.indexOf(siloAssetToSiloAddressIndex[tokenIndex]) > -1) {
      let contract = new MulticallContract(deploymentConfig.siloLens, deploymentConfig.siloLensABI);
      tokenQueryIndex++
      return contract;
    }
    return null
  }).filter((item) => item);

  //@ts-ignore
  const [...allSiloBorrowerRates] = await multicallProviderRetryOnFailure(tokenContracts.map((contract, index) => contract.borrowAPY(queryIndexToSiloAddress[index], flattenedTokenAddresses[index])), 'all silo borrower rates', deploymentConfig.network);
  //@ts-ignore
  const [...allSiloLenderRates] = await multicallProviderRetryOnFailure(tokenContracts.map((contract, index) => contract.depositAPY(queryIndexToSiloAddress[index], flattenedTokenAddresses[index])), 'all silo lender rates', deploymentConfig.network);

  let rateResults : IAllSiloAssetRateResults = {};
  let borrowerResultsIndex = 0;
  for(let entry of allSiloBorrowerRates) {
    let rate = entry.toString()
    let singleResult = {
      rate: new BigNumber(utils.formatUnits(rate, 16)).toString(),
      side: 'BORROWER',
      tokenAddress: flattenedTokenAddresses[borrowerResultsIndex]
    };
    if(!rateResults[queryIndexToSiloAddress[borrowerResultsIndex]]) {
      rateResults[queryIndexToSiloAddress[borrowerResultsIndex]] = [];
      rateResults[queryIndexToSiloAddress[borrowerResultsIndex]].push(singleResult);
    } else {
      rateResults[queryIndexToSiloAddress[borrowerResultsIndex]].push(singleResult);
    }
    borrowerResultsIndex++;
  }

  let lenderResultsIndex = 0;
  for(let entry of allSiloLenderRates) {
    let rate = entry.toString()
    let singleResult = {
      rate: new BigNumber(utils.formatUnits(rate, 16)).toString(),
      side: 'LENDER',
      tokenAddress: flattenedTokenAddresses[lenderResultsIndex]
    };
    if(!rateResults[queryIndexToSiloAddress[lenderResultsIndex]]) {
      rateResults[queryIndexToSiloAddress[lenderResultsIndex]] = [];
      rateResults[queryIndexToSiloAddress[lenderResultsIndex]].push(singleResult);
    } else {
      rateResults[queryIndexToSiloAddress[lenderResultsIndex]].push(singleResult);
    }
    lenderResultsIndex++;
  }

  return rateResults;

}