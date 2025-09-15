// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract NFTCollection721 is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    
    Counters.Counter private _tokenIdCounter;
    
    uint256 public maxSupply;
    uint256 public mintPrice;
    string public baseTokenURI;
    bool public mintingEnabled = true;
    
    mapping(address => uint256) public mintedByAddress;
    uint256 public maxMintPerAddress = 10;
    
    event TokenMinted(address indexed to, uint256 indexed tokenId, string tokenURI);
    event MintingToggled(bool enabled);
    event BaseURIUpdated(string newBaseURI);
    event MintPriceUpdated(uint256 newPrice);
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply,
        uint256 _mintPrice,
        string memory _baseTokenURI,
        address _owner
    ) ERC721(name, symbol) {
        maxSupply = _maxSupply;
        mintPrice = _mintPrice;
        baseTokenURI = _baseTokenURI;
        _transferOwnership(_owner);
    }
    
    modifier mintingAllowed(uint256 quantity) {
        require(mintingEnabled, "Minting is currently disabled");
        require(quantity > 0, "Quantity must be greater than 0");
        require(_tokenIdCounter.current() + quantity <= maxSupply, "Would exceed max supply");
        require(mintedByAddress[msg.sender] + quantity <= maxMintPerAddress, "Would exceed max mint per address");
        require(msg.value >= mintPrice * quantity, "Insufficient payment");
        _;
    }
    
    function mint(address to, uint256 quantity) public payable nonReentrant mintingAllowed(quantity) {
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = _tokenIdCounter.current();
            _tokenIdCounter.increment();
            _safeMint(to, tokenId);
            
            string memory tokenURI = string(abi.encodePacked(baseTokenURI, "/", Strings.toString(tokenId), ".json"));
            _setTokenURI(tokenId, tokenURI);
            
            emit TokenMinted(to, tokenId, tokenURI);
        }
        
        mintedByAddress[to] += quantity;
    }
    
    function mintBatch(address[] calldata recipients, uint256[] calldata quantities) external onlyOwner {
        require(recipients.length == quantities.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(quantities[i] > 0, "Quantity must be greater than 0");
            require(_tokenIdCounter.current() + quantities[i] <= maxSupply, "Would exceed max supply");
            
            for (uint256 j = 0; j < quantities[i]; j++) {
                uint256 tokenId = _tokenIdCounter.current();
                _tokenIdCounter.increment();
                _safeMint(recipients[i], tokenId);
                
                string memory tokenURI = string(abi.encodePacked(baseTokenURI, "/", Strings.toString(tokenId), ".json"));
                _setTokenURI(tokenId, tokenURI);
                
                emit TokenMinted(recipients[i], tokenId, tokenURI);
            }
        }
    }
    
    function toggleMinting() external onlyOwner {
        mintingEnabled = !mintingEnabled;
        emit MintingToggled(mintingEnabled);
    }
    
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }
    
    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
        emit MintPriceUpdated(newPrice);
    }
    
    function setMaxMintPerAddress(uint256 newMax) external onlyOwner {
        maxMintPerAddress = newMax;
    }
    
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter.current();
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}