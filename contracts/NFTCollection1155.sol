// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract NFTCollection1155 is ERC1155, Ownable, ReentrancyGuard {
    using Strings for uint256;
    
    string public name;
    string public symbol;
    string public baseTokenURI;
    
    uint256 public nextTokenId = 1;
    mapping(uint256 => uint256) public tokenSupply;
    mapping(uint256 => uint256) public tokenMaxSupply;
    mapping(uint256 => uint256) public tokenMintPrice;
    mapping(uint256 => bool) public tokenMintingEnabled;
    mapping(uint256 => mapping(address => uint256)) public mintedByAddressPerToken;
    mapping(uint256 => uint256) public maxMintPerAddressPerToken;
    
    event TokenCreated(uint256 indexed tokenId, uint256 maxSupply, uint256 mintPrice);
    event TokenMinted(address indexed to, uint256 indexed tokenId, uint256 amount);
    event TokenMintingToggled(uint256 indexed tokenId, bool enabled);
    event BaseURIUpdated(string newBaseURI);
    event TokenMintPriceUpdated(uint256 indexed tokenId, uint256 newPrice);
    
    constructor(
        string memory _name,
        string memory _symbol,
        string memory _baseTokenURI,
        address _owner
    ) ERC1155(_baseTokenURI) {
        name = _name;
        symbol = _symbol;
        baseTokenURI = _baseTokenURI;
        _transferOwnership(_owner);
    }
    
    modifier tokenExists(uint256 tokenId) {
        require(tokenId > 0 && tokenId < nextTokenId, "Token does not exist");
        _;
    }
    
    modifier mintingAllowed(uint256 tokenId, uint256 amount) {
        require(tokenMintingEnabled[tokenId], "Minting is disabled for this token");
        require(amount > 0, "Amount must be greater than 0");
        require(tokenSupply[tokenId] + amount <= tokenMaxSupply[tokenId], "Would exceed max supply");
        require(
            mintedByAddressPerToken[tokenId][msg.sender] + amount <= maxMintPerAddressPerToken[tokenId],
            "Would exceed max mint per address for this token"
        );
        require(msg.value >= tokenMintPrice[tokenId] * amount, "Insufficient payment");
        _;
    }
    
    function createToken(
        uint256 maxSupply,
        uint256 mintPrice,
        uint256 maxMintPerAddress
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId;
        nextTokenId++;
        
        tokenMaxSupply[tokenId] = maxSupply;
        tokenMintPrice[tokenId] = mintPrice;
        tokenMintingEnabled[tokenId] = true;
        maxMintPerAddressPerToken[tokenId] = maxMintPerAddress;
        
        emit TokenCreated(tokenId, maxSupply, mintPrice);
        return tokenId;
    }
    
    function mint(
        address to,
        uint256 tokenId,
        uint256 amount
    ) public payable nonReentrant tokenExists(tokenId) mintingAllowed(tokenId, amount) {
        _mint(to, tokenId, amount, "");
        tokenSupply[tokenId] += amount;
        mintedByAddressPerToken[tokenId][to] += amount;
        
        emit TokenMinted(to, tokenId, amount);
    }
    
    function mintBatch(
        address to,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        require(tokenIds.length == amounts.length, "Arrays length mismatch");
        
        uint256 totalCost = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            uint256 amount = amounts[i];
            
            require(tokenId > 0 && tokenId < nextTokenId, "Token does not exist");
            require(tokenMintingEnabled[tokenId], "Minting is disabled for this token");
            require(amount > 0, "Amount must be greater than 0");
            require(tokenSupply[tokenId] + amount <= tokenMaxSupply[tokenId], "Would exceed max supply");
            require(
                mintedByAddressPerToken[tokenId][to] + amount <= maxMintPerAddressPerToken[tokenId],
                "Would exceed max mint per address for this token"
            );
            
            totalCost += tokenMintPrice[tokenId] * amount;
            tokenSupply[tokenId] += amount;
            mintedByAddressPerToken[tokenId][to] += amount;
            
            emit TokenMinted(to, tokenId, amount);
        }
        
        require(msg.value >= totalCost, "Insufficient payment");
        _mintBatch(to, tokenIds, amounts, "");
    }
    
    function adminMint(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner tokenExists(tokenId) {
        require(tokenSupply[tokenId] + amount <= tokenMaxSupply[tokenId], "Would exceed max supply");
        
        _mint(to, tokenId, amount, "");
        tokenSupply[tokenId] += amount;
        
        emit TokenMinted(to, tokenId, amount);
    }
    
    function toggleTokenMinting(uint256 tokenId) external onlyOwner tokenExists(tokenId) {
        tokenMintingEnabled[tokenId] = !tokenMintingEnabled[tokenId];
        emit TokenMintingToggled(tokenId, tokenMintingEnabled[tokenId]);
    }
    
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseTokenURI = newBaseURI;
        _setURI(newBaseURI);
        emit BaseURIUpdated(newBaseURI);
    }
    
    function setTokenMintPrice(uint256 tokenId, uint256 newPrice) external onlyOwner tokenExists(tokenId) {
        tokenMintPrice[tokenId] = newPrice;
        emit TokenMintPriceUpdated(tokenId, newPrice);
    }
    
    function setMaxMintPerAddressPerToken(uint256 tokenId, uint256 newMax) external onlyOwner tokenExists(tokenId) {
        maxMintPerAddressPerToken[tokenId] = newMax;
    }
    
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId > 0 && tokenId < nextTokenId, "Token does not exist");
        return string(abi.encodePacked(baseTokenURI, "/", tokenId.toString(), ".json"));
    }
    
    function totalSupply(uint256 tokenId) public view returns (uint256) {
        return tokenSupply[tokenId];
    }
    
    function exists(uint256 tokenId) public view returns (bool) {
        return tokenId > 0 && tokenId < nextTokenId;
    }
    
    function getTokenInfo(uint256 tokenId) external view returns (
        uint256 currentSupply,
        uint256 maxSupply,
        uint256 mintPrice,
        bool mintingEnabled,
        uint256 maxMintPerAddress
    ) {
        require(exists(tokenId), "Token does not exist");
        return (
            tokenSupply[tokenId],
            tokenMaxSupply[tokenId],
            tokenMintPrice[tokenId],
            tokenMintingEnabled[tokenId],
            maxMintPerAddressPerToken[tokenId]
        );
    }
}